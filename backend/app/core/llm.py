from abc import ABC, abstractmethod
from app.core.config import settings

class LLMProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, **kwargs) -> str:
        """Generate response from the LLM provider."""
        pass

class DummyLLMProvider(LLMProvider):
    async def generate(self, prompt: str, **kwargs) -> str:
        # Simple mock response
        return f"Dummy LLM Response to prompt: '{prompt[:50]}...'"

def get_llm_provider() -> LLMProvider:
    provider = settings.LLM_PROVIDER.lower()
    if provider == "dummy":
        return DummyLLMProvider()
    else:
        raise ValueError(f"Unknown LLM Provider: {settings.LLM_PROVIDER}")
