import requests

with open('.env.local', 'r') as f:
    for line in f:
        if line.startswith("ANTHROPIC_API_KEY="):
            ANTHROPIC_API_KEY = line.strip().split("=")[1]
            break

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"

headers = {
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
}

payload = {
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 1024,
    "messages": [
        {"role": "user", "content": "Hello"}
    ]
}

response = requests.post(ANTHROPIC_API_URL, headers=headers, json=payload)
print("Status Code:", response.status_code)
print("Response Text:", response.text)
