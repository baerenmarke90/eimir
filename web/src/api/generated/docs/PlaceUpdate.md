
# PlaceUpdate

Place correction payload.  ``latitude`` and ``longitude`` may explicitly be ``null`` here, allowing a place to be reset to a name-only record. The service treats coordinates as a pair; sending only one results in ``PLACE_COORDINATE_PAIR_REQUIRED``.

## Properties

Name | Type
------------ | -------------
`address` | string
`description` | string
`latitude` | number
`longitude` | number
`name` | string

## Example

```typescript
import type { PlaceUpdate } from ''

// TODO: Update the object below with actual values
const example = {
  "address": null,
  "description": null,
  "latitude": null,
  "longitude": null,
  "name": null,
} satisfies PlaceUpdate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PlaceUpdate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


