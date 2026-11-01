
# DashboardExperience


## Properties

Name | Type
------------ | -------------
`authorId` | string
`createdAt` | Date
`happenedOn` | Date
`id` | string
`kind` | [ExperienceKind](ExperienceKind.md)
`text` | string

## Example

```typescript
import type { DashboardExperience } from ''

// TODO: Update the object below with actual values
const example = {
  "authorId": null,
  "createdAt": null,
  "happenedOn": null,
  "id": null,
  "kind": null,
  "text": null,
} satisfies DashboardExperience

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DashboardExperience
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


