import requests
from typing import Dict, List


class OmniBridgeError(Exception):
    def __init__(self, message: str, status_code: int, response_body):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class OmniBridge:
    def __init__(self, api_key: str, base_url: str = "http://localhost:3000"):
        self.api_key = api_key
        self.base_url = base_url

    def complete(self, provider: str, messages: List[Dict[str, str]], agent_mode: bool = False) -> dict:
        """Execute text completions or tool calls through the unified AI provider layer."""
        url = f"{self.base_url}/v1/chat/completions"
        payload = {
            "provider": provider,
            "messages": messages,
            "agent_mode": agent_mode
        }
        return self._post(url, payload)

    def search(self, query: str, engine: str = "google", max_results: int = 5) -> dict:
        """Fetch live web search results cleanly formatted for application memory or agent context."""
        url = f"{self.base_url}/v1/search"
        payload = {
            "query": query,
            "engine": engine,
            "max_results": max_results
        }
        return self._post(url, payload)

    def _post(self, url: str, payload: dict) -> dict:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        response = requests.post(url, json=payload, headers=headers)
        try:
            body = response.json()
        except ValueError:
            body = response.text
        if not response.ok:
            message = body.get("error") if isinstance(body, dict) else None
            raise OmniBridgeError(
                message or f"Request failed with status {response.status_code}.",
                response.status_code,
                body,
            )
        return body
