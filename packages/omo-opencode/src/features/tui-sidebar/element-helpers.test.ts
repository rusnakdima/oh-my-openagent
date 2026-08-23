import { describe, expect, it } from "bun:test"

import { box, text } from "./element-helpers"
import { LABEL_MAX } from "./constants"

describe("element-helpers", () => {
  describe("box", () => {
    it("#given props and no children #when box #then returns box ViewNode with empty children", () => {
      const node = box({ flexDirection: "column" })
      expect(node.kind).toBe("box")
      expect(node.props).toEqual({ flexDirection: "column" })
      expect(node.children).toEqual([])
    })

    it("#given props and children #when box #then returns box ViewNode with children", () => {
      const child = text({}, "hello")
      const node = box({ flexDirection: "column" }, [child])
      expect(node.kind).toBe("box")
      expect(node.props).toEqual({ flexDirection: "column" })
      expect(node.children).toHaveLength(1)
      expect(node.children?.[0]).toEqual(child)
    })

    it("#given box with no props #when box #then returns box with empty props", () => {
      const node = box({})
      expect(node.kind).toBe("box")
      expect(node.props).toEqual({})
    })
  })

  describe("text", () => {
    it("#given props and value #when text #then returns text ViewNode with text set", () => {
      const node = text({ color: "green" }, "hello world")
      expect(node.kind).toBe("text")
      expect(node.props).toEqual({ color: "green" })
      expect(node.text).toBe("hello world")
    })

    it("#given empty value #when text #then returns text ViewNode with empty text", () => {
      const node = text({}, "")
      expect(node.kind).toBe("text")
      expect(node.text).toBe("")
    })
  })

  describe("truncation at LABEL_MAX", () => {
    it("#given label at exactly LABEL_MAX chars #when box with that label #then label appears unchanged", () => {
      const label = "a".repeat(LABEL_MAX)
      const node = box({ label })
      expect(node.props.label).toHaveLength(LABEL_MAX)
      expect(node.props.label).toBe(label)
    })

    it("#given label exceeding LABEL_MAX chars #when used in box props #then label is not automatically truncated (truncation happens at render time)", () => {
      const longLabel = "a".repeat(LABEL_MAX + 10)
      const node = box({ label: longLabel })
      // The helper itself does not truncate — render-view.ts truncates at display time
      expect(node.props.label).toHaveLength(LABEL_MAX + 10)
      expect(node.props.label).toBe(longLabel)
    })

    it("#given text node with value at LABEL_MAX chars #when text #then value unchanged", () => {
      const value = "x".repeat(LABEL_MAX)
      const node = text({}, value)
      expect(node.text).toHaveLength(LABEL_MAX)
    })
  })
})
