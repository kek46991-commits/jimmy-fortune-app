import base64
import io
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
import requests
from PIL import Image

import gemini_fortune as fortune


@pytest.fixture
def photos(tmp_path):
    paths = []
    for label, color in zip(("face", "right", "left"), ("red", "green", "blue")):
        path = tmp_path / f"{label}.png"
        Image.new("RGB", (64, 80), color).save(path)
        paths.append(str(path))
    return paths


def rest_response(monkeypatch, data=None, status=200):
    response = MagicMock()
    response.status_code = status
    response.json.return_value = data or {
        "candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "鑑定やで！"}]}}]
    }
    response.__enter__.return_value = response
    post = MagicMock(return_value=response)
    monkeypatch.setattr(fortune.requests, "post", post)
    return post


def test_import_does_not_create_client(monkeypatch):
    from google import genai

    constructor = MagicMock(side_effect=AssertionError("No eager client"))
    monkeypatch.setattr(genai, "Client", constructor)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    import importlib

    importlib.reload(fortune)
    assert "APIキー" in fortune.analyze_fortune("", "", "", "男性")
    constructor.assert_not_called()


def test_image_resizes_rotates_and_removes_metadata(tmp_path):
    path = tmp_path / "oriented.jpg"
    exif = Image.Exif()
    exif[274] = 6
    exif[315] = "Private metadata"
    Image.new("RGB", (2000, 1000)).save(path, exif=exif)
    data = fortune.prepare_image(str(path))
    with Image.open(io.BytesIO(data)) as result:
        assert result.format == "JPEG"
        assert result.size == (800, 1600)
        assert not result.getexif()


def test_transparent_image_has_white_background(tmp_path):
    path = tmp_path / "transparent.png"
    Image.new("RGBA", (20, 20), (0, 0, 0, 0)).save(path)
    with Image.open(io.BytesIO(fortune.prepare_image(str(path)))) as result:
        assert result.getpixel((0, 0)) == (255, 255, 255)


def test_invalid_missing_and_oversized_images(tmp_path, monkeypatch, photos):
    path = tmp_path / "invalid.jpg"
    path.write_text("not an image")
    for invalid in (str(path), str(tmp_path / "missing.jpg")):
        with pytest.raises(fortune.FortuneError):
            fortune.prepare_image(invalid)
    monkeypatch.setattr(fortune, "MAX_IMAGE_BYTES", 1)
    with pytest.raises(fortune.FortuneError, match="20MB"):
        fortune.prepare_image(photos[0])


def test_pixel_limit(monkeypatch, photos):
    monkeypatch.setattr(fortune, "MAX_IMAGE_PIXELS", 1)
    with pytest.raises(fortune.FortuneError, match="2400"):
        fortune.prepare_image(photos[0])


def test_rest_request_order_timeout_and_key_header(monkeypatch, photos):
    monkeypatch.setenv("ANDROID_ARGUMENT", "1")
    post = rest_response(monkeypatch)
    assert fortune.analyze_fortune(*photos, "男性", api_key=" test-key ") == "鑑定やで！"
    args, kwargs = post.call_args
    assert fortune.MODEL in args[0]
    assert "test-key" not in args[0]
    assert kwargs["headers"] == {"x-goog-api-key": "test-key"}
    assert kwargs["timeout"] == (10, 90)
    parts = kwargs["json"]["contents"][0]["parts"]
    assert [parts[i]["text"] for i in (1, 3, 5)] == ["顔写真", "右手の手相", "左手の手相"]
    for index in (2, 4, 6):
        with Image.open(io.BytesIO(base64.b64decode(parts[index]["inlineData"]["data"]))) as img:
            assert img.format == "JPEG"
    assert kwargs["json"]["generationConfig"]["temperature"] == 0.7


@pytest.mark.parametrize("status", [400, 401, 403, 404, 429, 500, 503])
def test_http_errors_are_safe(monkeypatch, photos, status):
    monkeypatch.setenv("ANDROID_ARGUMENT", "1")
    rest_response(monkeypatch, status=status)
    result = fortune.analyze_fortune(*photos, "女性", api_key="private-key")
    assert result.startswith("エラー")
    assert "private-key" not in result


@pytest.mark.parametrize(
    "exception", [requests.Timeout("secret"), requests.ConnectionError("secret")]
)
def test_network_failure_is_safe(monkeypatch, photos, exception):
    monkeypatch.setenv("ANDROID_ARGUMENT", "1")
    monkeypatch.setattr(fortune.requests, "post", MagicMock(side_effect=exception))
    result = fortune.analyze_fortune(*photos, "その他", api_key="private-key")
    assert "エラー" in result
    assert "secret" not in result


@pytest.mark.parametrize(
    "data",
    [
        {"promptFeedback": {"blockReason": "SAFETY"}},
        {"candidates": [{"finishReason": "SAFETY"}]},
        {"candidates": [{"finishReason": "MAX_TOKENS"}]},
        {"candidates": [{"finishReason": "STOP", "content": {"parts": []}}]},
    ],
)
def test_blocked_empty_or_incomplete_result(monkeypatch, photos, data):
    monkeypatch.setenv("ANDROID_ARGUMENT", "1")
    rest_response(monkeypatch, data)
    assert "エラー" in fortune.analyze_fortune(*photos, "男性", api_key="key")


def test_rest_ignores_thought_parts(monkeypatch, photos):
    monkeypatch.setenv("ANDROID_ARGUMENT", "1")
    rest_response(
        monkeypatch,
        {
            "candidates": [
                {
                    "finishReason": "STOP",
                    "content": {
                        "parts": [
                            {"text": "internal", "thought": True},
                            {"text": "鑑定"},
                        ]
                    },
                }
            ]
        },
    )
    assert fortune.analyze_fortune(*photos, "男性", api_key="key") == "鑑定"


def test_desktop_sdk_configuration_and_client_cleanup(monkeypatch, photos):
    from google import genai
    from google.genai import types

    monkeypatch.delenv("ANDROID_ARGUMENT", raising=False)
    client = MagicMock()
    client.__enter__.return_value = client
    client.models.generate_content.return_value = SimpleNamespace(
        text="鑑定やで！",
        candidates=[SimpleNamespace(finish_reason=types.FinishReason.STOP)],
    )
    constructor = MagicMock(return_value=client)
    monkeypatch.setattr(genai, "Client", constructor)
    monkeypatch.setenv("GEMINI_API_KEY", "env-key")
    assert fortune.analyze_fortune(*photos, "男性") == "鑑定やで！"
    kwargs = client.models.generate_content.call_args.kwargs
    assert kwargs["model"] == "gemini-2.5-flash"
    assert kwargs["config"].system_instruction == fortune.SYSTEM_INSTRUCTION
    assert [part.text for part in kwargs["contents"].parts[1::2]] == [
        "顔写真",
        "右手の手相",
        "左手の手相",
    ]
    assert constructor.call_args.kwargs["api_key"] == "env-key"
    client.__exit__.assert_called_once()


def test_invalid_gender_and_images_do_not_send(monkeypatch, photos):
    send = MagicMock()
    monkeypatch.setattr(fortune, "_generate_sdk", send)
    assert "性別" in fortune.analyze_fortune(*photos, "invalid", api_key="key")
    assert "エラー" in fortune.analyze_fortune("", "", "", "男性", api_key="key")
    send.assert_not_called()


def test_desktop_sdk_errors_do_not_expose_key(monkeypatch, photos):
    from google import genai
    from google.genai import errors

    monkeypatch.delenv("ANDROID_ARGUMENT", raising=False)
    client = MagicMock()
    client.__enter__.return_value = client
    client.models.generate_content.side_effect = errors.ClientError(
        429, {"error": {"message": "private-key", "status": "RESOURCE_EXHAUSTED"}}
    )
    monkeypatch.setattr(genai, "Client", MagicMock(return_value=client))
    result = fortune.analyze_fortune(*photos, "男性", api_key="private-key")
    assert "上限" in result
    assert "private-key" not in result


def test_invalid_json_response_is_safe(monkeypatch, photos):
    monkeypatch.setenv("ANDROID_ARGUMENT", "1")
    post = rest_response(monkeypatch)
    post.return_value.json.side_effect = ValueError("private-key")
    result = fortune.analyze_fortune(*photos, "男性", api_key="private-key")
    assert "応答" in result
    assert "private-key" not in result


def test_android_spec_and_font_packaging():
    import configparser

    root = Path(__file__).resolve().parents[1]
    spec = configparser.ConfigParser()
    spec.read(root / "buildozer.spec")
    app = spec["app"]
    assert app["android.permissions"] == "INTERNET"
    assert app["android.allow_backup"] == "False"
    assert "google-genai" not in app["requirements"]
    assert "libwebp==1.6.0" in app["requirements"]
    assert "chardet==5.2.0" in app["requirements"]
    assert ".mypy_cache" in app["source.exclude_dirs"]
    assert "web" in app["source.exclude_dirs"]
    assert "ttf" in app["source.include_exts"]
    assert (root / "assets/NotoSansJP.ttf").stat().st_size > 100_000
    assert "SIL OPEN FONT LICENSE" in (root / "assets/OFL.txt").read_text()
