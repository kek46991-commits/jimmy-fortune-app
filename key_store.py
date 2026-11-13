"""Persist the user's Gemini API key: Android Keystore AES-GCM, or a 0600 file on PC."""

import base64
import json
import os
from pathlib import Path

ALIAS = "hoshitsumugi_gemini_key"
FILE_NAME = "gemini_api_key.json"
GCM_TAG_BITS = 128


class KeyStoreError(Exception):
    """The saved key could not be stored or read."""


def _to_bytes(data) -> bytes:
    if isinstance(data, (bytes, bytearray)):
        return bytes(data)
    if hasattr(data, "tostring"):
        return bytes(data.tostring())
    return bytes(value & 0xFF for value in data)


class AndroidCipher:
    """Encrypts with a non-exportable AES key held in the Android Keystore."""

    def __init__(self):
        from jnius import autoclass

        self._autoclass = autoclass
        self._cipher_class = autoclass("javax.crypto.Cipher")

    def _key(self):
        autoclass = self._autoclass
        store = autoclass("java.security.KeyStore").getInstance("AndroidKeyStore")
        store.load(None)
        if not store.containsAlias(ALIAS):
            props = autoclass("android.security.keystore.KeyProperties")
            builder = autoclass("android.security.keystore.KeyGenParameterSpec$Builder")
            spec = (
                builder(ALIAS, props.PURPOSE_ENCRYPT | props.PURPOSE_DECRYPT)
                .setBlockModes([props.BLOCK_MODE_GCM])
                .setEncryptionPaddings([props.ENCRYPTION_PADDING_NONE])
                .setKeySize(256)
                .build()
            )
            generator = autoclass("javax.crypto.KeyGenerator").getInstance(
                props.KEY_ALGORITHM_AES, "AndroidKeyStore"
            )
            generator.init(spec)
            generator.generateKey()
        return store.getKey(ALIAS, None)

    def encrypt(self, plain: bytes) -> dict[str, str]:
        cipher = self._cipher_class.getInstance("AES/GCM/NoPadding")
        cipher.init(self._cipher_class.ENCRYPT_MODE, self._key())
        sealed = _to_bytes(cipher.doFinal(plain))
        return {
            "iv": base64.b64encode(_to_bytes(cipher.getIV())).decode("ascii"),
            "data": base64.b64encode(sealed).decode("ascii"),
        }

    def decrypt(self, record: dict[str, str]) -> bytes:
        spec = self._autoclass("javax.crypto.spec.GCMParameterSpec")(
            GCM_TAG_BITS, base64.b64decode(record["iv"])
        )
        cipher = self._cipher_class.getInstance("AES/GCM/NoPadding")
        cipher.init(self._cipher_class.DECRYPT_MODE, self._key(), spec)
        return _to_bytes(cipher.doFinal(base64.b64decode(record["data"])))

    def forget(self):
        store = self._autoclass("java.security.KeyStore").getInstance("AndroidKeyStore")
        store.load(None)
        if store.containsAlias(ALIAS):
            store.deleteEntry(ALIAS)


class ApiKeyStore:
    """Stores one API key in the app's private data directory."""

    def __init__(self, data_dir: str, cipher=None):
        self.path = Path(data_dir) / FILE_NAME
        self.cipher = cipher

    @property
    def encrypted(self) -> bool:
        return self.cipher is not None

    def load(self) -> str:
        try:
            record = json.loads(self.path.read_text("utf-8"))
        except FileNotFoundError:
            return ""
        except (OSError, ValueError) as exc:
            raise KeyStoreError("保存したキーを読めへんかったわ。もう一度設定してな！") from exc
        try:
            if record.get("v") != 1:
                raise ValueError("unknown version")
            if record.get("mode") == "keystore":
                if self.cipher is None:
                    raise ValueError("keystore unavailable")
                return self.cipher.decrypt(record).decode("utf-8")
            if record.get("mode") == "plain" and self.cipher is None:
                return str(record["key"])
            raise ValueError("unsupported mode")
        except Exception as exc:
            raise KeyStoreError("保存したキーを読めへんかったわ。もう一度設定してな！") from exc

    def save(self, key: str) -> None:
        key = key.strip()
        if not key:
            raise KeyStoreError("APIキーが空っぽやで！")
        try:
            if self.cipher is not None:
                record = {"v": 1, "mode": "keystore", **self.cipher.encrypt(key.encode("utf-8"))}
            else:
                record = {"v": 1, "mode": "plain", "key": key}
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temp = self.path.with_suffix(".tmp")
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(record, handle)
            os.replace(temp, self.path)
        except Exception as exc:
            raise KeyStoreError("キーを保存できへんかったわ。もう一度試してな！") from exc

    def delete(self) -> None:
        self.path.unlink(missing_ok=True)
        self.path.with_suffix(".tmp").unlink(missing_ok=True)
        if self.cipher is not None:
            try:
                self.cipher.forget()
            except Exception:
                pass


def default_store(data_dir: str, android: bool) -> ApiKeyStore:
    return ApiKeyStore(data_dir, AndroidCipher() if android else None)
