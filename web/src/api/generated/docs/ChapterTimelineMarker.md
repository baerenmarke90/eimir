
# ChapterTimelineMarker

A diary-only destination at an authored chapter start, not Story content.

## Properties

Name | Type
------------ | -------------
`endOn` | Date
`id` | string
`position` | number
`startOn` | Date
`title` | string

## Example

```typescript
import type { ChapterTimelineMarker } from ''

// TODO: Update the object below with actual values
const example = {
  "endOn": null,
  "id": null,
  "position": null,
  "startOn": null,
  "title": null,
} satisfies ChapterTimelineMarker

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ChapterTimelineMarker
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


