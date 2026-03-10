import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders Snake & Ladders title", () => {
  render(<App />);
  expect(screen.getByText(/snake & ladders/i)).toBeInTheDocument();
});
