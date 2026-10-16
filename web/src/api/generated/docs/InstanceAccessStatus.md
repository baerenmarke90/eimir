
# InstanceAccessStatus

Public access state.  Three independent questions are answered separately so a client never derives one from another:  - ``registrationAvailable``: does the administrator currently admit new   Accounts at all (``false`` during maintenance)? - ``accountCreation``: through which path can a new Account come into being   on this deployment? - ``auth``: which methods can an existing Account use to sign in?

## Properties

Name | Type
------------ | -------------
`accountCreation` | string
`auth` | [AuthCapabilities](AuthCapabilities.md)
`maintenanceMode` | boolean
`registrationAvailable` | boolean
`registrationUnavailableReason` | string
`selfServiceSignupAvailable` | boolean

## Example

```typescript
import type { InstanceAccessStatus } from ''

// TODO: Update the object below with actual values
const example = {
  "accountCreation": null,
  "auth": null,
  "maintenanceMode": null,
  "registrationAvailable": null,
  "registrationUnavailableReason": null,
  "selfServiceSignupAvailable": null,
} satisfies InstanceAccessStatus

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as InstanceAccessStatus
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


