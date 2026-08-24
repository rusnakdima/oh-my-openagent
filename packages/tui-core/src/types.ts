// TUI interaction types

export type TuiSessionOptions = {
  sessionName: string;
  windowName?: string;
  paneIndex?: number;
  command?: string;
};

export type TuiSnapshot = {
  sessionName: string;
  windowName: string;
  paneIndex: number;
  captureTime: number;
  rawOutput: string;
  parsedLayout?: TuiLayout;
};

export type TuiLayout = {
  width: number;
  height: number;
  lines: TuiLine[];
  elements: TuiElement[];
};

export type TuiLine = {
  index: number;
  content: string;
  hasAnsi: boolean;
};

export type TuiElement = {
  type: "button" | "menu" | "text" | "input" | "panel" | "unknown";
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isFocused: boolean;
  isHighlighted: boolean;
  metadata?: Record<string, unknown>;
};

export type MouseClickOptions = {
  x: number;
  y: number;
  button?: "left" | "middle" | "right";
  type?: "click" | "double-click" | "down" | "up";
};

export type KeyPressOptions = {
  key: string;
  modifiers?: ("ctrl" | "alt" | "shift" | "meta")[];
};

export type RunTuiCommandOptions = {
  timeoutMs?: number;
  retry?: number;
};
