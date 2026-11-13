
# PartnerDistanceView

Neutral when unavailable: no reason is ever disclosed.

## Properties

Name | Type
------------ | -------------
`asOf` | Date
`available` | boolean
`band` | [DistanceBandView](DistanceBandView.md)

## Example

```typescript
import type { PartnerDistanceView } from ''

// TODO: Update the object below with actual values
const example = {
  "asOf": null,
  "available": null,
  "band": null,
} satisfies PartnerDistanceView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PartnerDistanceView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


