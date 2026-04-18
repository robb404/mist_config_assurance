import os
from functools import lru_cache
from cryptography.fernet import Fernet


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    key = os.environ["TOKEN_ENCRYPTION_KEY"].encode()
    return Fernet(key)


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()
