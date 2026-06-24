#!/usr/bin/env python3
"""Inject the latest compat test results between markers in the README."""
import re
import sys

START = "<!-- TEST-RESULTS:START -->"
END = "<!-- TEST-RESULTS:END -->"


def main() -> None:
    output_path, readme_path = sys.argv[1], sys.argv[2]
    try:
        with open(output_path, encoding="utf-8") as fh:
            output = fh.read()
    except FileNotFoundError:
        output = ""

    summary = re.search(r"Summary (\d+)/(\d+) passed \((\d+) failed", output)
    failing = [ln[2:].strip() for ln in output.splitlines() if ln.startswith("F ")]

    lines = [START]
    if summary:
        passed, total, failed = (int(g) for g in summary.groups())
        color = "brightgreen" if failed == 0 else "red"
        label = f"{passed}%2F{total}%20passed"
        lines.append(f"![tests](https://img.shields.io/badge/tests-{label}-{color})")
        lines.append("")
        if failed == 0:
            lines.append(f"All {total} compat checks passing.")
        else:
            lines.append(f"**{failed} of {total} compat checks failing:**")
            lines.append("")
            for case in failing:
                lines.append(f"- `{case}`")
    else:
        lines.append("![tests](https://img.shields.io/badge/tests-no%20results-lightgrey)")
        lines.append("")
        lines.append("Last run did not produce results (setup error).")
    lines.append(END)
    block = "\n".join(lines)

    with open(readme_path, encoding="utf-8") as fh:
        readme = fh.read()

    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.DOTALL)
    if pattern.search(readme):
        readme = pattern.sub(block, readme)
    else:
        readme = readme.rstrip() + "\n\n" + block + "\n"

    with open(readme_path, "w", encoding="utf-8") as fh:
        fh.write(readme)

    print("README results block updated")


if __name__ == "__main__":
    main()
