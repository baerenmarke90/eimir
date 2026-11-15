
# DateIdea

One curated idea; all texts come from one locale entry.

## Properties

Name | Type
------------ | -------------
`budgetEurForTwo` | number
`category` | [DateIdeaCategory](DateIdeaCategory.md)
`contentLocale` | string
`description` | string
`id` | string
`image` | [DateIdeaImage](DateIdeaImage.md)
`minutes` | number
`placeType` | [DateIdeaPlaceType](DateIdeaPlaceType.md)
`planTitle` | string
`prerequisites` | Array&lt;string&gt;
`title` | string
`wishTitle` | string

## Example

```typescript
import type { DateIdea } from ''

// TODO: Update the object below with actual values
const example = {
  "budgetEurForTwo": null,
  "category": null,
  "contentLocale": null,
  "description": null,
  "id": null,
  "image": null,
  "minutes": null,
  "placeType": null,
  "planTitle": null,
  "prerequisites": null,
  "title": null,
  "wishTitle": null,
} satisfies DateIdea

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DateIdea
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


