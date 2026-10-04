import requests
from typing import list, dict, optional

class OmniBridge:
    def __init__(self, api_key: str, base_url: str = "http://localhost:3000"):
        self.api_key = api_key
        self.base_url = base_url

    def complete(self, provider: str, messages: list[dict], agent_mode: bool = False) -> dict:
        """Execute text completions or tool calls through the unified AI provider layer."""
        url = f"{self.base_url}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "provider": provider,
            "messages": messages,
            "agent_mode": agent_mode
        }
        response = requests.post(url, json=payload, headers=headers)
        return response.json()

    def search(self, query: str, engine: str = "google", max_results: int = 5) -> dict:
        """Fetch live web search results cleanly formatted for application memory or agent context."""
        url = f"{self.base_url}/v1/search"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "query": query,
            "engine": engine,
            "max_results": max_results
        }
        response = requests.post(url, json=payload, headers=headers)
        return response.json()
