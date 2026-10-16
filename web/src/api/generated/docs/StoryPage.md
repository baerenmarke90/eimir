
# StoryPage


## Properties

Name | Type
------------ | -------------
`availableYears` | Array&lt;number&gt;
`hasMore` | boolean
`items` | [Array&lt;StoryItem&gt;](StoryItem.md)
`nextCursor` | string

## Example

```typescript
import type { StoryPage } from ''

// TODO: Update the object below with actual values
const example = {
  "availableYears": null,
  "hasMore": null,
  "items": null,
  "nextCursor": null,
} satisfies StoryPage

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as StoryPage
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


