
# WishStatus

State machine defined by M3-D02/D03/D04.  The complete set is declared here. A wish begins at ``OPEN`` and reaches the other states only through the wish-to-plan lifecycle. Keeping the values in the model and database avoids a later status-type migration over existing rows.

## Properties

Name | Type
------------ | -------------

## Example

```typescript
import type { WishStatus } from ''

// TODO: Update the object below with actual values
const example = {
} satisfies WishStatus

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as WishStatus
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


