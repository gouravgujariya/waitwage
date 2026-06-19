#!/usr/bin/env python3
"""Sleep for N seconds — use as a VS Code task to demo Kickback Status."""

import argparse
import sys
import time


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Wait N seconds (for testing Kickback Status extension)"
    )
    parser.add_argument(
        "seconds",
        type=int,
        help="Number of seconds to wait (e.g. 6 or 10)",
    )
    args = parser.parse_args()

    if args.seconds < 1:
        print("Seconds must be at least 1", file=sys.stderr)
        sys.exit(1)

    print(f"Waiting {args.seconds} seconds...")
    time.sleep(args.seconds)
    print("Done.")


if __name__ == "__main__":
    main()
