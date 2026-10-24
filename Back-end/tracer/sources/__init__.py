import importlib
import pkgutil

from .base import Source


def load_sources() -> list[Source]:
    """Import every module in this folder and instantiate each Source subclass found."""
    found = []
    for m in pkgutil.iter_modules(__path__):
        if m.name == "base":
            continue
        mod = importlib.import_module(f"{__name__}.{m.name}")
        for obj in vars(mod).values():
            if isinstance(obj, type) and issubclass(obj, Source) and obj is not Source and obj.__module__ == mod.__name__:
                found.append(obj())
    return found
