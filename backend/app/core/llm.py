from abc import ABC, abstractmethod
import urllib.request
import urllib.error
import json
import asyncio
from app.core.config import settings

class LLMProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, **kwargs) -> str:
        """Generate response from the LLM provider."""
        pass

class DummyLLMProvider(LLMProvider):
    async def generate(self, prompt: str, **kwargs) -> str:
        # Realistic Socratic fallback hint
        return (
            "💡 **Tutor Hint (Mock)**: Check the order of your assignments! "
            "If you overwrite your variable before copying its value to your helper variable, "
            "the original value is lost. Draw the variables on paper and trace their values step-by-step."
        )

class DeepSeekLLMProvider(LLMProvider):
    async def generate(self, prompt: str, **kwargs) -> str:
        api_key = settings.LLM_API_KEY
        if not api_key or api_key == "dummy-api-key":
            return (
                "💡 **Tutor Hint (Local Fallback)**: DeepSeek API Key is not configured. "
                "Trace your code manually. If this is a variable swap, did you store the original value in `temp` first? "
                "If this is a factorial, did you initialize the multiplier and loop correctly?"
            )
            
        url = "https://api.deepseek.com/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        system_content = kwargs.get(
            "system_prompt", 
            "You are a friendly, supportive computer science tutor helping a student learn pseudocode. "
            "Write in a supportive and guiding Socratic style. DO NOT output the final solution code."
        )
        model = kwargs.get("model", "deepseek-v4-flash")
        
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_content},
                {"role": "user", "content": prompt}
            ],
            "temperature": kwargs.get("temperature", 0.2)
        }
        
        try:
            loop = asyncio.get_running_loop()
            
            def make_request():
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers=headers,
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=12.0) as response:
                    return response.read().decode("utf-8")
                    
            resp_str = await loop.run_in_executor(None, make_request)
            resp_json = json.loads(resp_str)
            return resp_json["choices"][0]["message"]["content"]
            
        except urllib.error.HTTPError as he:
            try:
                err_body = he.read().decode("utf-8")
                err_json = json.loads(err_body)
                err_msg = err_json.get("error", {}).get("message", str(he))
            except Exception:
                err_msg = str(he)
            return f"DeepSeek API Error: {err_msg}"
        except Exception as e:
            return f"Failed to connect to DeepSeek API: {str(e)}"

def get_llm_provider() -> LLMProvider:
    provider = settings.LLM_PROVIDER.lower()
    if provider == "dummy":
        return DummyLLMProvider()
    elif provider.startswith("deepseek"):
        return DeepSeekLLMProvider()
    else:
        raise ValueError(f"Unknown LLM Provider: {settings.LLM_PROVIDER}")

