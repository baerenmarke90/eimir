
# PhotoSelectionView


## Properties

Name | Type
------------ | -------------
`authorizationUrl` | string
`hasMore` | boolean
`id` | string
`items` | [Array&lt;PhotoSelectionItemView&gt;](PhotoSelectionItemView.md)
`pickerUri` | string
`pollAfterSeconds` | number
`source` | string
`status` | string

## Example

```typescript
import type { PhotoSelectionView } from ''

// TODO: Update the object below with actual values
const example = {
  "authorizationUrl": null,
  "hasMore": null,
  "id": null,
  "items": null,
  "pickerUri": null,
  "pollAfterSeconds": null,
  "source": null,
  "status": null,
} satisfies PhotoSelectionView

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PhotoSelectionView
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


