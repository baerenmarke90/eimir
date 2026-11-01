
# CoupleExperienceQuestions


## Properties

Name | Type
------------ | -------------
`kind` | [ExperienceKind](ExperienceKind.md)
`localDate` | Date
`questionIds` | Array&lt;string&gt;
`refreshAfterSeconds` | number

## Example

```typescript
import type { CoupleExperienceQuestions } from ''

// TODO: Update the object below with actual values
const example = {
  "kind": null,
  "localDate": null,
  "questionIds": null,
  "refreshAfterSeconds": null,
} satisfies CoupleExperienceQuestions

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CoupleExperienceQuestions
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


