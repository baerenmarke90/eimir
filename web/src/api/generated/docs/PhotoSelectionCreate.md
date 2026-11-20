
# PhotoSelectionCreate


## Properties

Name | Type
------------ | -------------
`allowVideo` | boolean
`consent` | boolean
`maxItems` | number
`mediaRecoveryPolicy` | string
`returnTo` | string
`source` | string

## Example

```typescript
import type { PhotoSelectionCreate } from ''

// TODO: Update the object below with actual values
const example = {
  "allowVideo": null,
  "consent": null,
  "maxItems": null,
  "mediaRecoveryPolicy": null,
  "returnTo": null,
  "source": null,
} satisfies PhotoSelectionCreate

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PhotoSelectionCreate
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


