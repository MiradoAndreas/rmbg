# Repository Guidelines

## Project Structure & Module Organization

`main.py` contains the FastAPI app, image validation, URL fetching, and background removal endpoints. `static/index.html`, `static/script.js`, and `static/style.css` contain the browser UI. `requirements.txt` lists Python dependencies. There is currently no dedicated test directory or build output; keep generated files such as `__pycache__/` and the local `.venv/` out of contributions.

## Build, Test, and Development Commands

From the repository root, create a virtual environment and install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Run the app with `uvicorn main:app --reload`, then open `http://127.0.0.1:8000/`. The first start loads the `u2net` model and may take longer. There is no separate build step. Run `python -m compileall -q main.py` for a Python syntax check.

## Coding Style & Naming Conventions

Use four spaces in Python and two spaces in HTML, CSS, and JavaScript. Follow the existing Python style: `snake_case` for functions and variables, `UPPER_SNAKE_CASE` for constants, and type annotations where useful. Keep JavaScript variables and functions in `camelCase`; use descriptive CSS class names and reuse the existing CSS custom properties. No formatter or linter is configured, so keep changes consistent with adjacent code.

## Testing Guidelines

There is no automated test framework or coverage target yet. For backend changes, verify both `/api/remove-bg` (file upload) and `/api/remove-bg-from-url` (JSON URL) as relevant, including rejected formats, oversized files, and invalid or private URLs. For UI changes, check upload, URL input, preview, reset, and PNG download in a browser. If adding automated tests, place them in `tests/` and name Python files `test_*.py`.

## Commit & Pull Request Guidelines

No Git history is available in this workspace, so no existing commit format can be inferred. Use short, imperative commit subjects that describe the change, such as `Validate uploaded image size`. Pull requests should explain the behavior changed, list checks performed, link a related issue when one exists, and include screenshots for visible UI changes.

## Security & Configuration

Preserve the 10 MB upload limit, 20 million pixel limit, accepted JPEG/PNG/WEBP formats, and public HTTP(S) URL checks when changing image handling. Keep URL redirects bounded and do not allow requests to private addresses. Do not commit local environments, downloaded model files, or secrets.
