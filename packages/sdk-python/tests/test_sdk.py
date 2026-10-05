import unittest
import sys
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from omnibridge import OmniBridge, OmniBridgeError


class OmniBridgeSdkTests(unittest.TestCase):
    @patch("omnibridge.requests.post")
    def test_successful_request_sends_bearer_key(self, post):
        response = Mock(ok=True)
        response.json.return_value = {"success": True}
        post.return_value = response

        result = OmniBridge("test-key").search("query")

        self.assertEqual(result, {"success": True})
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer test-key")

    @patch("omnibridge.requests.post")
    def test_http_error_raises_typed_exception_with_body(self, post):
        response = Mock(ok=False, status_code=401)
        response.json.return_value = {"success": False, "error": "API key revoked."}
        post.return_value = response

        with self.assertRaises(OmniBridgeError) as raised:
            OmniBridge("test-key").complete("openai", [{"role": "user", "content": "hello"}])

        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(str(raised.exception), "API key revoked.")
        self.assertEqual(raised.exception.response_body["success"], False)

    @patch("omnibridge.requests.post")
    def test_non_json_http_error_is_still_reported(self, post):
        response = Mock(ok=False, status_code=502, text="bad gateway")
        response.json.side_effect = ValueError("invalid JSON")
        post.return_value = response

        with self.assertRaises(OmniBridgeError) as raised:
            OmniBridge("test-key").search("query")

        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(raised.exception.response_body, "bad gateway")


if __name__ == "__main__":
    unittest.main()
