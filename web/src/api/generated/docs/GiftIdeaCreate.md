
# GiftIdeaCreate


## Properties

Name | Type
------------ | -------------
`description` | string
`occasion` | string
`pinned` | boolean
`priceText` | string
`recipient` | string
`targetOn` | Date
`title` | string
`url` | string

## Example

```typescript
import type { GiftIdeaCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "description": null,
  "occasion": null,
  "pinned": null,
  "priceText": null,
  "recipient": null,
  "targetOn": null,
  "title": null,
  "url": null,
} satisfies GiftIdeaCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as GiftIdeaCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


