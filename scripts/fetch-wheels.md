# Fetching flake8 wheels for the Pyodide offscreen runtime

Pinned versions (flake8 6.1.0's own dependency pins: pyflakes>=3.1.0,<3.2.0;
pycodestyle>=2.11.0,<2.12.0; mccabe>=0.7.0,<0.8.0):

- flake8 6.1.0
- pyflakes 3.1.0
- pycodestyle 2.11.1
- mccabe 0.7.0

Re-fetch with:

```bash
pip download flake8==6.1.0 pyflakes==3.1.0 pycodestyle==2.11.1 mccabe==0.7.0 \
  --no-deps --only-binary=:all: --python-version 311 --implementation py3 \
  --abi none --platform any -d packages/core/src/pyodide/wheels/
```

Downloaded wheel filenames and sha256 (fill in from `sha256sum packages/core/src/pyodide/wheels/*.whl`
after running the command above):

- `flake8-6.1.0-py2.py3-none-any.whl` — `ffdfce58ea94c6580c77888a86506937f9a1a227dfcd15f245d694ae20a6b6e5`
- `pyflakes-3.1.0-py2.py3-none-any.whl` — `4132f6d49cb4dae6819e5379898f2b8cce3c5f23994194c24b77d5da2e36f774`
- `pycodestyle-2.11.1-py2.py3-none-any.whl` — `44fe31000b2d866f2e41841b18528a505fbd7fef9017b04eff4e2648a0fadc67`
- `mccabe-0.7.0-py2.py3-none-any.whl` — `6c2d30ab6be0e4a46919781807b4f0d834ebdd6c6e3dca0bda5a15f863427b6e`
