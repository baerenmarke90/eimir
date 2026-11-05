
# MilestoneSummary


## Properties

Name | Type
------------ | -------------
`author` | [AuthorSummary](AuthorSummary.md)
`capabilities` | [ResourceCapabilities](ResourceCapabilities.md)
`createdAt` | Date
`happenedOn` | Date
`id` | string
`places` | [Array&lt;StoryPlaceSummary&gt;](StoryPlaceSummary.md)
`title` | string

## Example

```typescript
import type { MilestoneSummary } from ''

// TODO: Update the object below with actual values
const example = {
  "author": null,
  "capabilities": null,
  "createdAt": null,
  "happenedOn": null,
  "id": null,
  "places": null,
  "title": null,
} satisfies MilestoneSummary

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as MilestoneSummary
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


