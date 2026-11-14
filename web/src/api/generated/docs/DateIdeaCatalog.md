
# DateIdeaCatalog


## Properties

Name | Type
------------ | -------------
`catalogVersion` | string
`categories` | [Array&lt;DateIdeaCategory&gt;](DateIdeaCategory.md)
`currency` | string
`edition` | string
`ideas` | [Array&lt;DateIdea&gt;](DateIdea.md)
`locale` | string
`totalCount` | number

## Example

```typescript
import type { DateIdeaCatalog } from ''

// TODO: Update the object below with actual values
const example = {
  "catalogVersion": null,
  "categories": null,
  "currency": null,
  "edition": null,
  "ideas": null,
  "locale": null,
  "totalCount": null,
} satisfies DateIdeaCatalog

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DateIdeaCatalog
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


