"""OpenAlex (public API, no key). Gives related papers as context. Not used for the verdict."""
import os

import requests

from ..models import Claim, Evidence
from .base import Source


class OpenAlex(Source):
    name = "OpenAlex"

    def find(self, claim: Claim) -> list[Evidence]:
        params = {"search": f"{claim.metric} {claim.place or ''}".strip(), "per_page": 3,
                  "select": "id,title,publication_year,doi"}
        if os.getenv("OPENALEX_MAILTO"):
            params["mailto"] = os.getenv("OPENALEX_MAILTO")
        r = requests.get("https://api.openalex.org/works", params=params, timeout=5)
        r.raise_for_status()
        return [Evidence(source=self.name, title=f"{w.get('title')} ({w.get('publication_year')})",
                         url=w.get("doi") or w.get("id"), note="Related paper, not used for the verdict")
                for w in r.json().get("results", [])]
