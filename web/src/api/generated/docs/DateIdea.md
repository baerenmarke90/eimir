
# DateIdea

One curated idea, localized to the response locale where available.

## Properties

Name | Type
------------ | -------------
`budgetBand` | [BudgetBand](BudgetBand.md)
`budgetMax` | number
`budgetMin` | number
`categoryId` | string
`contentLocale` | string
`description` | string
`durationBand` | [DurationBand](DurationBand.md)
`durationMaxMinutes` | number
`durationMinMinutes` | number
`id` | string
`requirements` | Array&lt;string&gt;
`savedWishId` | string
`setting` | [DateSetting](DateSetting.md)
`title` | string

## Example

```typescript
import type { DateIdea } from ''

// TODO: Update the object below with actual values
const example = {
  "budgetBand": null,
  "budgetMax": null,
  "budgetMin": null,
  "categoryId": null,
  "contentLocale": null,
  "description": null,
  "durationBand": null,
  "durationMaxMinutes": null,
  "durationMinMinutes": null,
  "id": null,
  "requirements": null,
  "savedWishId": null,
  "setting": null,
  "title": null,
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


