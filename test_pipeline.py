import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "packages" / "sdk-python"))

from omnibridge import OmniBridge


def run_python_tests():
    print("🐍 Starting OmniBridge Python Agent Integration Testing Matrix...\n")
    omni = OmniBridge(
        api_key="omni_python_secret_key_789",
        base_url="http://localhost:3000",
    )

    print("--- Test Case A (Python): Human Model Request ---")
    human_res = omni.complete(
        provider="openai",
        messages=[{"role": "user", "content": "Hello from Python runtime!"}],
        agent_mode=False,
    )
    assert human_res.get("success") is True, f"Human completion failed: {human_res}"
    assert human_res.get("identity") == "human", f"Unexpected human identity: {human_res}"
    print("Status: ✅ PASSED")
    print("Registered Identity:", human_res.get("identity"))

    print("\n--- Test Case B (Python): Agent Model Request ---")
    agent_res = omni.complete(
        provider="anthropic",
        messages=[{"role": "user", "content": "Execute agentic database scanning task."}],
        agent_mode=True,
    )
    assert agent_res.get("success") is True, f"Agent completion failed: {agent_res}"
    assert agent_res.get("identity") == "agent", f"Unexpected agent identity: {agent_res}"
    print("Status: ✅ PASSED")
    print("Registered Identity:", agent_res.get("identity"))

    query = "Top python open source agent frameworks 2026"
    print("\n--- Test Case C (Python): Search and Cache ---")
    start_time = time.perf_counter()
    search_res_1 = omni.search(query=query, engine="google")
    duration_1 = time.perf_counter() - start_time
    assert search_res_1.get("success") is True, f"Initial search failed: {search_res_1}"
    assert isinstance(search_res_1.get("results"), list), "Search response has no results list."
    print(f"Request 1 Duration: {duration_1:.4f}s | Status: ✅ PASSED")

    start_time = time.perf_counter()
    search_res_2 = omni.search(query=query, engine="google")
    duration_2 = time.perf_counter() - start_time
    assert search_res_2.get("success") is True, f"Repeated search failed: {search_res_2}"
    assert search_res_2 == search_res_1, "Repeated query did not return the cached response."
    print(f"Request 2 (Cached) Duration: {duration_2:.4f}s | Status: ✅ PASSED")
    print("Caching Verification: Identical response returned for the repeated search.")

    print("\n🏁 All Python SDK validation cases passed.")


if __name__ == "__main__":
    run_python_tests()
