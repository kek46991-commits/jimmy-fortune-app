"""Japanese KivyMD fortune reader with Android Storage Access Framework."""

import os
import threading
from functools import partial
from pathlib import Path
from tempfile import NamedTemporaryFile

from kivy.clock import Clock, mainthread
from kivy.core.text import LabelBase
from kivy.core.window import Window
from kivy.lang import Builder
from kivy.properties import BooleanProperty
from kivy.utils import platform
from kivymd.app import MDApp
from kivymd.uix.filemanager import MDFileManager
from kivymd.uix.label import MDLabel
from kivymd.uix.snackbar import MDSnackbar

from gemini_fortune import MAX_IMAGE_BYTES, FortuneError, analyze_fortune, prepare_image

FONT = str(Path(__file__).parent / "assets" / "NotoSansJP.ttf")
TARGETS = {"face": "顔写真", "right": "右手の手相", "left": "左手の手相"}
PICK_IMAGE = 7101

KV = """
<ReadingLabel@MDLabel>:
    size_hint_y: None
    height: self.texture_size[1] + dp(8)
    text_size: self.width, None

MDBoxLayout:
    orientation: "vertical"
    MDTopAppBar:
        title: "星紡ぎ — AI手相・人相鑑定"
        elevation: 4
        right_action_items: [["delete-outline", lambda x: app.clear_reading()]]
    ScrollView:
        do_scroll_x: False
        MDBoxLayout:
            orientation: "vertical"
            size_hint_y: None
            height: self.minimum_height
            spacing: "14dp"
            padding: "16dp"
            ReadingLabel:
                text: "顔と両手から、星紡ぎがあなたの物語をひもとく。"
                font_style: "H6"
                bold: True
            ReadingLabel:
                text: "これは娯楽の占いです。写真から性格や未来が確定するものではありません。"
                theme_text_color: "Secondary"
            MDTextField:
                id: api_key
                hint_text: "Gemini APIキー"
                helper_text: "端末には保存しません（自分のキーを使用）"
                helper_text_mode: "persistent"
                password: True
                multiline: False
                font_name: "JimmyJP"
                disabled: app.busy
            ReadingLabel:
                text: "1. 性別を選択"
                bold: True
            MDBoxLayout:
                adaptive_height: True
                spacing: "8dp"
                disabled: app.busy
                MDRaisedButton:
                    text: "男性"
                    on_release: app.set_gender("男性")
                MDRaisedButton:
                    text: "女性"
                    on_release: app.set_gender("女性")
                MDRaisedButton:
                    text: "その他"
                    on_release: app.set_gender("その他")
            ReadingLabel:
                id: label_gender
                text: "選択中: 未選択"
                theme_text_color: "Secondary"
            MDSeparator:
            ReadingLabel:
                text: "2. 写真を選択（JPEG・PNG・WebP）"
                bold: True
            ReadingLabel:
                text: "本人または撮影・送信の許可を得た写真を使ってな。手は明るい場所で、手のひら全体が写るように！"
                theme_text_color: "Secondary"
            MDRectangleFlatIconButton:
                icon: "camera"
                text: "顔写真を選択"
                disabled: app.busy or app.importing
                on_release: app.open_file_manager("face")
            Image:
                id: preview_face
                size_hint_y: None
                height: "100dp" if self.source else 0
            ReadingLabel:
                id: label_face
                text: "未選択"
                theme_text_color: "Secondary"
            MDRectangleFlatIconButton:
                icon: "hand-back-right-outline"
                text: "右手の手相写真を選択"
                disabled: app.busy or app.importing
                on_release: app.open_file_manager("right")
            Image:
                id: preview_right
                size_hint_y: None
                height: "100dp" if self.source else 0
            ReadingLabel:
                id: label_right
                text: "未選択"
                theme_text_color: "Secondary"
            MDRectangleFlatIconButton:
                icon: "hand-back-left-outline"
                text: "左手の手相写真を選択"
                disabled: app.busy or app.importing
                on_release: app.open_file_manager("left")
            Image:
                id: preview_left
                size_hint_y: None
                height: "100dp" if self.source else 0
            ReadingLabel:
                id: label_left
                text: "未選択"
                theme_text_color: "Secondary"
            MDSeparator:
            ReadingLabel:
                text: "3. 送信内容を確認"
                bold: True
            ReadingLabel:
                text: "鑑定時のみ、選んだ写真3枚と性別をGoogle Geminiへ送信します。画像は縮小・位置情報等を除去します。Google側のデータ利用はAPIの規約・設定に従います。"
                theme_text_color: "Secondary"
            MDBoxLayout:
                adaptive_height: True
                MDCheckbox:
                    id: consent
                    size_hint: None, None
                    size: "48dp", "48dp"
                    disabled: app.busy
                ReadingLabel:
                    text: "写真と性別の送信に同意する"
                    pos_hint: {"center_y": .5}
            MDRaisedButton:
                id: btn_submit
                text: "星紡ぎで、本音のAI鑑定をはじめる"
                md_bg_color: 1, 0.3, 0, 1
                pos_hint: {"center_x": .5}
                disabled: app.busy or app.importing
                on_release: app.start_analysis()
            MDProgressBar:
                id: progress_bar
                type: "indeterminate"
                size_hint_y: None
                height: "4dp"
                opacity: 1 if app.busy or app.importing else 0
            ReadingLabel:
                text: "【鑑定結果】"
                font_style: "H6"
                bold: True
            ReadingLabel:
                id: result_label
                text: "あなたの星の物語が、ここに届きます。"
                markup: False
            MDFlatButton:
                text: "写真・APIキー・結果を消去"
                disabled: app.busy or app.importing
                pos_hint: {"center_x": .5}
                on_release: app.clear_reading()
"""


class FortuneApp(MDApp):
    busy = BooleanProperty(False)
    importing = BooleanProperty(False)

    def build(self):
        LabelBase.register(
            name="JimmyJP",
            fn_regular=FONT,
            fn_bold=FONT,
            fn_italic=FONT,
            fn_bolditalic=FONT,
        )
        for name, style in self.theme_cls.font_styles.items():
            if name != "Icon":
                style[0] = "JimmyJP"
        self.theme_cls.primary_palette = "DeepOrange"
        self.title = "星紡ぎ — AI手相・人相鑑定"
        self.gender = ""
        self.paths = dict.fromkeys(TARGETS, "")
        self.current_selection = ""
        self._manager_open = False
        self._stopped = False
        self._photo_lock = threading.Lock()
        self._photo_dir = Path(self.user_data_dir) / "photos"
        self._photo_dir.mkdir(parents=True, exist_ok=True)
        self._delete_photos()
        self.file_manager = MDFileManager(
            exit_manager=self.exit_file_manager,
            select_path=self.select_path,
            ext=[".jpg", ".jpeg", ".png", ".webp"],
            selector="file",
        )
        Window.bind(on_keyboard=self._on_keyboard)
        if platform == "android":
            from android import activity

            activity.bind(on_activity_result=self._on_activity_result)
        root = Builder.load_string(KV)
        root.ids.api_key.text = os.environ.get("GEMINI_API_KEY", "")
        return root

    def set_gender(self, value):
        self.gender = value
        self.root.ids.label_gender.text = f"選択中: {value}"

    def open_file_manager(self, target):
        if self.busy or self.importing or self.current_selection:
            return
        self.current_selection = target
        try:
            if platform == "android":
                from android.runnable import run_on_ui_thread
                from jnius import autoclass

                @run_on_ui_thread
                def launch():
                    try:
                        Intent = autoclass("android.content.Intent")
                        activity = autoclass("org.kivy.android.PythonActivity").mActivity
                        intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
                        intent.addCategory(Intent.CATEGORY_OPENABLE)
                        intent.setType("image/*")
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        activity.startActivityForResult(intent, PICK_IMAGE)
                    except Exception:
                        self._complete_import(target, "", "写真選択を開けへんかったわ！")

                launch()
            else:
                self.file_manager.show(str(Path.home()))
                self._manager_open = True
        except Exception:
            self.current_selection = ""
            self.show_toast("写真選択を開けへんかったわ！")

    def select_path(self, path):
        target = self.current_selection
        self.exit_file_manager()
        self._begin_import(target, path, False)

    def exit_file_manager(self, *args):
        self.file_manager.close()
        self._manager_open = False
        self.current_selection = ""

    def _on_activity_result(self, request, result, intent):
        if request != PICK_IMAGE:
            return
        target = self.current_selection
        if result != -1 or intent is None or intent.getData() is None:
            Clock.schedule_once(lambda dt: self._cancel_picker())
            return
        uri = intent.getData().toString()
        Clock.schedule_once(lambda dt: self._begin_import(target, uri, True))

    def _cancel_picker(self):
        self.current_selection = ""

    def _begin_import(self, target, source, android_uri):
        if self._stopped:
            return
        self.importing = True
        self.root.ids.progress_bar.start()
        threading.Thread(
            target=self._import_photo,
            args=(target, source, android_uri),
            daemon=True,
        ).start()

    def _copy_android_uri(self, uri, destination):
        from jnius import autoclass

        activity = autoclass("org.kivy.android.PythonActivity").mActivity
        stream = activity.getContentResolver().openInputStream(
            autoclass("android.net.Uri").parse(uri)
        )
        if stream is None:
            raise FortuneError("写真を開けへんかったわ！")
        try:
            output = autoclass("java.io.FileOutputStream")(str(destination))
            try:
                incoming = autoclass("java.nio.channels.Channels").newChannel(stream)
                channel = output.getChannel()
                total = 0
                while total <= MAX_IMAGE_BYTES:
                    count = channel.transferFrom(incoming, total, MAX_IMAGE_BYTES + 1 - total)
                    if count == 0:
                        break
                    total += count
                if total > MAX_IMAGE_BYTES:
                    raise FortuneError("写真は1枚20MB以下にしてな！")
            finally:
                output.close()
        finally:
            stream.close()

    def _import_photo(self, target, source, android_uri):
        try:
            if android_uri:
                with NamedTemporaryFile(dir=self._photo_dir, suffix=".import") as temp:
                    self._copy_android_uri(source, temp.name)
                    data = prepare_image(temp.name)
            else:
                data = prepare_image(source)
            with self._photo_lock:
                if self._stopped:
                    return
                destination = self._photo_dir / f"{target}.jpg"
                destination.write_bytes(data)
            self._complete_import(target, str(destination), "")
        except FortuneError as exc:
            self._complete_import(target, "", str(exc))
        except Exception:
            self._complete_import(target, "", "写真を取り込めへんかったわ。選び直してな！")

    @mainthread
    def _complete_import(self, target, path, error):
        if self._stopped:
            return
        self.importing = False
        self.current_selection = ""
        self.root.ids.progress_bar.stop()
        if error:
            self.show_toast(error)
            return
        self.paths[target] = path
        self.root.ids[f"label_{target}"].text = f"{TARGETS[target]}: 選択済み"
        preview = self.root.ids[f"preview_{target}"]
        preview.source = path
        preview.reload()

    def start_analysis(self):
        if self.busy or self.importing:
            return
        key = self.root.ids.api_key.text.strip()
        if not key:
            self.show_toast("Gemini APIキーを入力してな！")
            return
        if not self.gender:
            self.show_toast("性別を選んでや！")
            return
        if not all(self.paths.values()):
            self.show_toast("顔・右手・左手の写真3枚全部選んでな！")
            return
        if not self.root.ids.consent.active:
            self.show_toast("Googleへの写真送信に同意してな！")
            return
        self.busy = True
        self.root.ids.progress_bar.start()
        self.root.ids.result_label.text = "星紡ぎが、あなたの物語を読み解いています…"
        work = partial(
            analyze_fortune,
            self.paths["face"],
            self.paths["right"],
            self.paths["left"],
            self.gender,
            api_key=key,
        )
        threading.Thread(target=self._run_async, args=(work,), daemon=True).start()

    def _run_async(self, work):
        try:
            text = work()
        except Exception:
            text = "鑑定できへんかったわ。もう一度試してな！"
        self.update_result(text)

    @mainthread
    def update_result(self, text):
        if self._stopped:
            return
        self.root.ids.result_label.text = text
        self.root.ids.progress_bar.stop()
        self.busy = False

    def show_toast(self, text):
        MDSnackbar(MDLabel(text=text, font_style="Body2")).open()

    def _delete_photos(self):
        with self._photo_lock:
            for path in self._photo_dir.iterdir():
                if path.is_file():
                    path.unlink(missing_ok=True)

    def clear_reading(self):
        if self.busy or self.importing or self.current_selection:
            return
        for target in TARGETS:
            self.paths[target] = ""
            self.root.ids[f"label_{target}"].text = "未選択"
            self.root.ids[f"preview_{target}"].source = ""
        self._delete_photos()
        self.gender = ""
        self.root.ids.label_gender.text = "選択中: 未選択"
        self.root.ids.api_key.text = ""
        self.root.ids.consent.active = False
        self.root.ids.result_label.text = "あなたの星の物語が、ここに届きます。"

    def _on_keyboard(self, window, key, *args):
        if key in (27, 1001) and self._manager_open:
            self.exit_file_manager()
            return True
        return False

    def on_pause(self):
        return True

    def on_stop(self):
        self._stopped = True
        Window.unbind(on_keyboard=self._on_keyboard)
        if platform == "android":
            from android import activity

            activity.unbind(on_activity_result=self._on_activity_result)
        self.root.ids.api_key.text = ""
        self._delete_photos()


if __name__ == "__main__":
    FortuneApp().run()
