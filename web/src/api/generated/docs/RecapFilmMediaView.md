
# RecapFilmMediaView

A curated picture of a film scene; a video names the muted clip it plays.

## Properties

Name | Type
------------ | -------------
`attachmentId` | string
`clipSeconds` | number
`clipStartSeconds` | number
`focusX` | number
`focusY` | number
`kind` | string
`parentId` | string
`shape` | string

## Example

```typescript
import type { RecapFilmMediaView } from ''

// TODO: Update the object below with actual values
const example = {
  "attachmentId": null,
  "clipSeconds": null,
  "clipStartSeconds": null,
  "focusX": null,
  "focusY": null,
  "kind": null,
  "parentId": null,
  "shape": null,
} satisfies RecapFilmMediaView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as RecapFilmMediaView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


