"""Widget/controller unit tests, not device or end-to-end UI tests."""

import sys
import threading
import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from PIL import Image


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    from kivy.clock import Clock

    from main import FortuneApp

    class TestApp(FortuneApp):
        @property
        def user_data_dir(self):
            return str(tmp_path)

    app = TestApp()
    app._run_prepare()
    Clock.tick()
    yield app
    Clock.tick()
    app.stop()


def wait_for(predicate):
    from kivy.clock import Clock

    deadline = time.monotonic() + 5
    while not predicate() and time.monotonic() < deadline:
        Clock.tick()
        time.sleep(0.01)
    assert predicate()


def test_widget_generation_and_snackbar(app):
    assert "ジミー" in app.root.ids.btn_submit.text
    assert not app.root.ids.consent.active
    assert app.on_pause() is True
    app.show_toast("写真を選んでな！")
    app.set_gender("男性")
    assert app.root.ids.label_gender.text == "選択中: 男性"


def test_validation_does_not_start_worker(app, monkeypatch):
    show = MagicMock()
    monkeypatch.setattr(app, "show_toast", show)
    thread = MagicMock()
    monkeypatch.setattr("main.threading.Thread", thread)
    app.start_analysis()
    assert "APIキー" in show.call_args.args[0]
    app.root.ids.api_key.text = "test-key"
    app.start_analysis()
    assert "性別" in show.call_args.args[0]
    app.set_gender("女性")
    app.start_analysis()
    assert "3枚" in show.call_args.args[0]
    app.paths = dict.fromkeys(app.paths, "photo.jpg")
    app.start_analysis()
    assert "同意" in show.call_args.args[0]
    thread.assert_not_called()


def test_async_completion_duplicate_prevention_and_cleanup(app, monkeypatch):
    finished = threading.Event()
    entered = threading.Event()
    calls = []

    def analyze(*args, **kwargs):
        calls.append((args, kwargs))
        entered.set()
        assert finished.wait(3)
        return "ジミーの鑑定結果"

    monkeypatch.setattr("main.analyze_fortune", analyze)
    app.root.ids.api_key.text = "test-key"
    app.set_gender("その他")
    app.paths = dict.fromkeys(app.paths, "photo.jpg")
    app.root.ids.consent.active = True
    app.start_analysis()
    assert entered.wait(2)
    assert app.busy
    assert app.root.ids.btn_submit.disabled
    app.start_analysis()
    app.clear_reading()
    assert app.root.ids.api_key.text == "test-key"
    finished.set()
    wait_for(lambda: not app.busy)
    assert len(calls) == 1
    assert calls[0] == (("photo.jpg", "photo.jpg", "photo.jpg", "その他"), {"api_key": "test-key"})
    assert app.root.ids.result_label.text == "ジミーの鑑定結果"
    assert not app.root.ids.btn_submit.disabled
    app.clear_reading()
    assert not app.root.ids.api_key.text
    assert not app.root.ids.consent.active
    assert not any(app.paths.values())


def test_photo_import_validation_and_deletion(app, tmp_path, monkeypatch):
    source = tmp_path / "source.png"
    Image.new("RGB", (32, 40), "red").save(source)
    app._begin_import("face", str(source), False)
    wait_for(lambda: not app.importing)
    assert app.paths["face"]
    assert app.root.ids.preview_face.source == app.paths["face"]
    copied = app._photo_dir / "face.jpg"
    assert copied.exists()
    assert "選択済み" in app.root.ids.label_face.text
    show = MagicMock()
    monkeypatch.setattr(app, "show_toast", show)
    app._begin_import("face", str(tmp_path / "missing.jpg"), False)
    wait_for(lambda: not app.importing)
    show.assert_called_once()
    assert app.paths["face"] == str(copied)
    app.clear_reading()
    assert not copied.exists()
    assert source.exists()


def test_worker_error_reenables_controls(app):
    app.busy = True

    def failure():
        raise RuntimeError("secret")

    app._run_async(failure)
    wait_for(lambda: not app.busy)
    assert "secret" not in app.root.ids.result_label.text
    assert not app.root.ids.btn_submit.disabled


def test_android_picker_cancel_and_content_uri_callback(app, monkeypatch):
    from kivy.clock import Clock

    from main import PICK_IMAGE

    app.current_selection = "right"
    app._on_activity_result(PICK_IMAGE, 0, None)
    Clock.tick()
    assert not app.current_selection
    app.current_selection = "left"
    begin = MagicMock()
    monkeypatch.setattr(app, "_begin_import", begin)
    intent = MagicMock()
    intent.getData.return_value.toString.return_value = "content://photos/42"
    app._on_activity_result(PICK_IMAGE, -1, intent)
    Clock.tick()
    begin.assert_called_once_with("left", "content://photos/42", True)


def test_android_copy_closes_streams_and_handles_partial_transfers(app, tmp_path, monkeypatch):
    stream = MagicMock()
    activity = MagicMock()
    activity.getContentResolver.return_value.openInputStream.return_value = stream
    output = MagicMock()
    channel = output.getChannel.return_value
    channel.transferFrom.side_effect = [10, 20, 0]
    classes = {
        "org.kivy.android.PythonActivity": SimpleNamespace(mActivity=activity),
        "android.net.Uri": MagicMock(),
        "java.io.FileOutputStream": MagicMock(return_value=output),
        "java.nio.channels.Channels": MagicMock(),
    }
    monkeypatch.setitem(sys.modules, "jnius", SimpleNamespace(autoclass=classes.__getitem__))
    app._copy_android_uri("content://photos/42", tmp_path / "temp.jpg")
    assert [call.args[1] for call in channel.transferFrom.call_args_list] == [0, 10, 30]
    stream.close.assert_called_once()
    output.close.assert_called_once()
