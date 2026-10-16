
# SearchResult


## Properties

Name | Type
------------ | -------------
`excerpt` | string
`id` | string
`occurredOn` | Date
`parentId` | string
`scope` | [SearchScope](SearchScope.md)
`title` | string
`type` | [SearchKind](SearchKind.md)

## Example

```typescript
import type { SearchResult } from ''

// TODO: Update the object below with actual values
const example = {
  "excerpt": null,
  "id": null,
  "occurredOn": null,
  "parentId": null,
  "scope": null,
  "title": null,
  "type": null,
} satisfies SearchResult

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SearchResult
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


