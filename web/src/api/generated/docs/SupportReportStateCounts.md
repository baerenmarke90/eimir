
# SupportReportStateCounts

Unarchived reports per triage state, whatever the list filter.

## Properties

Name | Type
------------ | -------------
`closed` | number
`inProgress` | number
`_new` | number

## Example

```typescript
import type { SupportReportStateCounts } from ''

// TODO: Update the object below with actual values
const example = {
  "closed": null,
  "inProgress": null,
  "_new": null,
} satisfies SupportReportStateCounts

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SupportReportStateCounts
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


