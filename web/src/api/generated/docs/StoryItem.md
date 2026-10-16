
# StoryItem

A timeline item discriminated by ``kind``.  This is a named type rather than an anonymous union in the list field. Otherwise OpenAPI names it after its location (``StoryPageItemsInner``) and every generated client propagates that accidental name. ``API-DESIGN.md`` calls the contract type ``StoryItem`` and the schema should do the same.

## Properties

Name | Type
------------ | -------------
`effectiveDate` | Date
`kind` | string
`memory` | [MemorySummary](MemorySummary.md)
`heartMoment` | [SharedHeartMomentSummary](SharedHeartMomentSummary.md)
`milestone` | [MilestoneSummary](MilestoneSummary.md)

## Example

```typescript
import type { StoryItem } from ''

// TODO: Update the object below with actual values
const example = {
  "effectiveDate": null,
  "kind": null,
  "memory": null,
  "heartMoment": null,
  "milestone": null,
} satisfies StoryItem

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as StoryItem
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


