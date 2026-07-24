from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
import os
import stripe

# Setup Flask to serve static files from current directory
app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY")
DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")

if os.path.exists(".env.local"):
    try:
        with open(".env.local", "r") as f:
            for line in f:
                if line.startswith("DEEPSEEK_API_KEY=") and not DEEPSEEK_API_KEY:
                    DEEPSEEK_API_KEY = line.strip().split("=")[1]
                elif line.startswith("ANTHROPIC_API_KEY=") and not ANTHROPIC_API_KEY:
                    ANTHROPIC_API_KEY = line.strip().split("=")[1]
                elif line.startswith("STRIPE_SECRET_KEY=") and not stripe.api_key:
                    stripe.api_key = line.strip().split("=")[1]
    except Exception as e:
        print("Error reading .env.local fallback:", e)


def generate_deepseek(system_prompt, user_prompt):
    if not DEEPSEEK_API_KEY:
        return jsonify({"error": "Deepseek API key not found"}), 500
        
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "stream": False
    }
    
    try:
        response = requests.post(DEEPSEEK_API_URL, headers=headers, json=payload)
        response.raise_for_status()
        res_data = response.json()
        text_content = res_data["choices"][0]["message"]["content"]
        return jsonify({"content": [{"text": text_content}]})
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e), "details": response.text if response else ""}), 500


def generate_anthropic(system_prompt, user_prompt):
    if not ANTHROPIC_API_KEY:
        return jsonify({"error": "Anthropic API key not found"}), 500
        
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }
    
    payload = {
        "model": "claude-3-haiku-20240307",
        "max_tokens": 1024,
        "system": system_prompt,
        "messages": [
            {"role": "user", "content": user_prompt}
        ]
    }
    
    try:
        response = requests.post(ANTHROPIC_API_URL, headers=headers, json=payload)
        response.raise_for_status()
        return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e), "details": response.text if response else ""}), 500


@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.json
    model_type = data.get("model_type", "deepseek")
    system_prompt = data.get("system_prompt", "You are a helpful AI assistant.")
    user_prompt = data.get("user_prompt", "")
    
    if model_type == "anthropic":
        return generate_anthropic(system_prompt, user_prompt)
    else:
        return generate_deepseek(system_prompt, user_prompt)


@app.route("/api/create-checkout-session", methods=["POST"])
def create_checkout_session():
    try:
        data = request.json
        price_id = data.get('priceId')
        
        # In a production app, you would pass the actual domain dynamically. 
        # For this local prototype, we use the local dev URL.
        domain_url = "http://localhost:8080"
        
        session = stripe.checkout.Session.create(
            line_items=[
                {
                    'price': price_id,
                    'quantity': 1,
                },
            ],
            mode='subscription',
            managed_payments={"enabled": False},
            success_url=domain_url + '?session_id={CHECKOUT_SESSION_ID}',
            cancel_url=domain_url,
        )
        return jsonify({"url": session.url})
    except Exception as e:
        return jsonify(error=str(e)), 403


@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/landing.html')
def serve_landing():
    return send_from_directory('.', 'landing.html')

if __name__ == "__main__":
    app.run(port=5001)
