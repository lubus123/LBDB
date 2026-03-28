"""
Export trained model weights to JSON for browser consumption.
Usage: python export.py <model.npz> [output.json]
"""

import sys
import json
import numpy as np
from network import Network


def export_to_json(model_path: str, output_path: str):
    net = Network()
    net.load(model_path)

    data = {
        'W1': net.W1.tolist(),
        'b1': net.b1.tolist(),
        'W2': net.W2.tolist(),
        'b2': net.b2.tolist(),
    }

    with open(output_path, 'w') as f:
        json.dump(data, f)

    # Report size
    raw = json.dumps(data)
    print(f"Exported {model_path} -> {output_path}")
    print(f"  Parameters: {net.W1.size + net.b1.size + net.W2.size + net.b2.size:,}")
    print(f"  JSON size: {len(raw):,} bytes ({len(raw)/1024:.1f} KB)")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python export.py <model.npz> [output.json]")
        sys.exit(1)

    model_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else '../public/model.json'
    export_to_json(model_path, output_path)
