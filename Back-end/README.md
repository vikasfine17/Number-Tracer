# Number Tracer

Paste a statistic. Number Tracer finds the original open dataset, shows the real figure and year,
and says whether the claim matches, is outdated, doesn't match, or can't be verified.

- **Open code:** MIT licensed. **Open data:** World Bank and OpenAlex public APIs. **Open-weight model:** Gemma through Ollama (check Gemma's own license terms). Gemini is optional.
- A model only reads the claim. The verdict is plain arithmetic, so it never invents a source.

## Run it
```
python -m venv venv && source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt
ollama pull gemma4 && ollama serve                  # open-weight default; or set TRACER_PROVIDER=gemini
python -m tracer "India's population is 1.4 billion"   # command line
uvicorn tracer.api:app --port 8000                     # API: POST /trace {"text": "..."}
pytest                                                 # offline tests
python scripts/benchmark.py                            # needs internet
```
See `.env.example` for settings. The first call downloads a small embedding model and the World Bank indicator list (cached in `.cache/`).

## Add a data source
Drop a file in `tracer/sources/` with a `Source` subclass. See CONTRIBUTING.md.

## Limits
Only claims covered by the connected datasets can be verified; everything else returns `cant_verify`.
Indicator matching uses text similarity, so check the evidence title shown with each verdict.
