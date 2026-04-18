import os
from cryptography.fernet import Fernet


def _fernet() -> Fernet:
    key = os.environ["TOKEN_ENCRYPTION_KEY"].encode()
    return Fernet(key)


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()
