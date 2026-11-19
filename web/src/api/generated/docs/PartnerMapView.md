
# PartnerMapView

An approximate area, not a precise position. Neutral when unavailable.

## Properties

Name | Type
------------ | -------------
`available` | boolean
`capturedAt` | Date
`latitude` | number
`longitude` | number
`radiusMeters` | number

## Example

```typescript
import type { PartnerMapView } from ''

// TODO: Update the object below with actual values
const example = {
  "available": null,
  "capturedAt": null,
  "latitude": null,
  "longitude": null,
  "radiusMeters": null,
} satisfies PartnerMapView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PartnerMapView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


