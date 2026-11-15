
# CoupleExperienceQuestionState

Answer state of one daily question for the reading partner.

## Properties

Name | Type
------------ | -------------
`answeredByMe` | boolean
`answeredByPartner` | boolean
`memoryId` | string
`questionId` | string

## Example

```typescript
import type { CoupleExperienceQuestionState } from ''

// TODO: Update the object below with actual values
const example = {
  "answeredByMe": null,
  "answeredByPartner": null,
  "memoryId": null,
  "questionId": null,
} satisfies CoupleExperienceQuestionState

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CoupleExperienceQuestionState
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


