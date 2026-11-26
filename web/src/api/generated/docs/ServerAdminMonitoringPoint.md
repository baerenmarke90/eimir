
# ServerAdminMonitoringPoint


## Properties

Name | Type
------------ | -------------
`activeSpaces` | number
`at` | Date
`diskTotalBytes` | number
`diskUsedBytes` | number
`failedEmails` | number
`failedJobs` | number
`failedPushes` | number
`newAccounts` | number
`p95Ms` | number
`requests` | number
`serverErrors` | number
`storedBytes` | number

## Example

```typescript
import type { ServerAdminMonitoringPoint } from ''

// TODO: Update the object below with actual values
const example = {
  "activeSpaces": null,
  "at": null,
  "diskTotalBytes": null,
  "diskUsedBytes": null,
  "failedEmails": null,
  "failedJobs": null,
  "failedPushes": null,
  "newAccounts": null,
  "p95Ms": null,
  "requests": null,
  "serverErrors": null,
  "storedBytes": null,
} satisfies ServerAdminMonitoringPoint

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ServerAdminMonitoringPoint
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


