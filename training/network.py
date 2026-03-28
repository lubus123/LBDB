"""
Simple MLP with TD-lambda training for backgammon position evaluation.

Architecture: 198 -> 80 -> 1
- Hidden layer: 80 sigmoid units
- Output: 1 sigmoid unit = P(white wins)
- Total parameters: 198*80 + 80 + 80*1 + 1 = 15,921

Training uses TD(lambda) with eligibility traces:
  - At each position, compute V(s) = network output
  - TD error: delta = V(s') - V(s)  (or reward - V(s) at game end)
  - Eligibility traces accumulate gradients with decay lambda
  - Weight update: w += alpha * delta * traces
"""

import numpy as np
import json
from pathlib import Path


def sigmoid(x: np.ndarray) -> np.ndarray:
    # Clip to avoid overflow
    x = np.clip(x, -500, 500)
    return 1.0 / (1.0 + np.exp(-x))


def sigmoid_derivative(output: np.ndarray) -> np.ndarray:
    """Derivative of sigmoid given the sigmoid output value."""
    return output * (1.0 - output)


class Network:
    def __init__(self, input_size: int = 198, hidden_size: int = 80, output_size: int = 1):
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.output_size = output_size

        # Xavier initialization
        scale1 = np.sqrt(2.0 / (input_size + hidden_size))
        scale2 = np.sqrt(2.0 / (hidden_size + output_size))

        self.W1 = np.random.randn(input_size, hidden_size).astype(np.float32) * scale1
        self.b1 = np.zeros(hidden_size, dtype=np.float32)
        self.W2 = np.random.randn(hidden_size, output_size).astype(np.float32) * scale2
        self.b2 = np.zeros(output_size, dtype=np.float32)

        # Cache for backprop
        self._input = None
        self._hidden = None
        self._output = None

    def forward(self, x: np.ndarray) -> float:
        """Forward pass. Returns P(white wins) as a scalar."""
        self._input = x
        z1 = x @ self.W1 + self.b1
        self._hidden = sigmoid(z1)
        z2 = self._hidden @ self.W2 + self.b2
        self._output = sigmoid(z2)
        return float(self._output[0])

    def compute_gradients(self) -> dict:
        """
        Compute dOutput/dWeights for all parameters.
        Must be called right after forward().
        Returns dict of gradients with same shape as weights.
        """
        # Output layer gradient: d_out/d_z2 = sigmoid'(z2) = out * (1 - out)
        d_out = sigmoid_derivative(self._output)  # (1,)

        # Gradients for W2 and b2
        # dOut/dW2 = hidden^T * d_out
        grad_W2 = self._hidden.reshape(-1, 1) * d_out  # (80, 1)
        grad_b2 = d_out.flatten()  # (1,)

        # Hidden layer: d_hidden = d_out * W2^T * sigmoid'(hidden)
        d_hidden = (d_out @ self.W2.T) * sigmoid_derivative(self._hidden)  # (80,)

        # Gradients for W1 and b1
        grad_W1 = self._input.reshape(-1, 1) * d_hidden  # (198, 80)
        grad_b1 = d_hidden.flatten()  # (80,)

        return {
            'W1': grad_W1,
            'b1': grad_b1,
            'W2': grad_W2,
            'b2': grad_b2,
        }

    def get_params(self) -> dict:
        return {'W1': self.W1, 'b1': self.b1, 'W2': self.W2, 'b2': self.b2}

    def forward_batch(self, X: np.ndarray) -> np.ndarray:
        """Batch forward pass. X shape: (N, input_size). Returns (N,) array of P(white wins)."""
        z1 = X @ self.W1 + self.b1           # (N, hidden)
        h1 = sigmoid(z1)                      # (N, hidden)
        z2 = h1 @ self.W2 + self.b2           # (N, 1)
        out = sigmoid(z2)                     # (N, 1)
        return out.ravel()                    # (N,)

    def save(self, path: str):
        """Save weights to numpy file."""
        np.savez(path, W1=self.W1, b1=self.b1, W2=self.W2, b2=self.b2)

    def load(self, path: str):
        """Load weights from numpy file."""
        data = np.load(path)
        self.W1 = data['W1'].astype(np.float32)
        self.b1 = data['b1'].astype(np.float32)
        self.W2 = data['W2'].astype(np.float32)
        self.b2 = data['b2'].astype(np.float32)

    def save_json(self, path: str):
        """Export weights as JSON for browser consumption."""
        data = {
            'W1': self.W1.tolist(),
            'b1': self.b1.tolist(),
            'W2': self.W2.tolist(),
            'b2': self.b2.tolist(),
        }
        with open(path, 'w') as f:
            json.dump(data, f)


class TDTrainer:
    """TD(lambda) trainer with eligibility traces."""

    def __init__(self, network: Network, alpha: float = 0.1, lambd: float = 0.7):
        self.network = network
        self.alpha = alpha
        self.lambd = lambd
        self.reset_traces()

    def reset_traces(self):
        """Reset eligibility traces to zero (call at start of each game)."""
        self.traces = {
            'W1': np.zeros_like(self.network.W1),
            'b1': np.zeros_like(self.network.b1),
            'W2': np.zeros_like(self.network.W2),
            'b2': np.zeros_like(self.network.b2),
        }

    def update(self, v_current: float, v_next: float):
        """
        TD update step.
        v_current: V(s_t) from the last forward pass
        v_next: V(s_{t+1}) or terminal reward
        """
        delta = v_next - v_current

        # Compute gradients for current position (already cached from forward pass)
        grads = self.network.compute_gradients()

        # Update eligibility traces: e = lambda * e + gradient
        for key in self.traces:
            self.traces[key] = self.lambd * self.traces[key] + grads[key]

        # Update weights: w += alpha * delta * e
        params = self.network.get_params()
        for key in params:
            params[key] += self.alpha * delta * self.traces[key]
