from ..models import Claim, Evidence


class Source:
    """To add a data source: create a new file in this folder with a subclass of Source.
    It is discovered automatically. Return Evidence with a `series` of (year, value)
    pairs if the source can check numbers, or without one if it only gives context."""
    name = "base"

    def find(self, claim: Claim) -> list[Evidence]:
        raise NotImplementedError
