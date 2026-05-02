// =============================================================================
// Umbra — Azure infrastructure (Phase 11a)
// =============================================================================
//
// Provisions the resource set for a single-tenant Umbra deployment in
// Australia East. Aligned with the locked decisions in Phase 11a:
//
//   - Region:               Australia East (Azure OpenAI + DI confirmed available)
//   - Postgres tier:        Burstable B1ms (prototype-scale)
//   - App Service Plan:     Linux B1, Always On = true (pg-boss worker)
//   - Web App identity:     SystemAssigned managed identity
//   - Key Vault:            RBAC mode; Web App granted Key Vault Secrets User
//   - Container source:     ACR-hosted Docker image
//   - Cross-product separation per plan Amendment A1: Umbra has its own
//                            Postgres + Storage + Azure AD app + AUTH_SECRET.
//                            Azure OpenAI + DI provisioned here too; the Web
//                            App can be reconfigured at any time via env to
//                            point at a shared instance instead.
//
// What's NOT in this template:
//   - Azure AD app registration (tenant-scoped; manual `az ad app create`)
//   - GPT-4o model deployment under the Azure OpenAI account (deployed
//     separately via `az cognitiveservices account deployment create` after
//     the account is provisioned — this template only stands up the account)
//   - Initial Key Vault secret population (provision.sh does this)
// =============================================================================

@description('Resource location. Australia East confirmed for Azure OpenAI + Document Intelligence GA.')
param location string = 'australiaeast'

@description('Resource name prefix. Defaults to "umbra-prototype".')
param namePrefix string = 'umbra-prototype'

@description('PostgreSQL admin user. Created at server provisioning time.')
param postgresAdminUser string = 'umbra'

@description('PostgreSQL admin password. Pass via --parameters dbAdminPassword=$UMBRA_DB_ADMIN_PASSWORD.')
@secure()
param dbAdminPassword string

@description('Object ID of the principal that should be granted Key Vault Administrator role on the new vault. Typically the deploying user. Use `az ad signed-in-user show --query id -o tsv`.')
param deployerObjectId string

// -----------------------------------------------------------------------------
// Computed names
// -----------------------------------------------------------------------------

var acrName = 'acr${replace(namePrefix, '-', '')}'
var aspName = 'asp-${namePrefix}'
var webAppName = 'app-${namePrefix}'
var postgresName = 'psql-${namePrefix}'
var postgresDatabaseName = 'umbra'
var storageAccountName = 'st${replace(namePrefix, '-', '')}'
var keyVaultName = 'kv-${namePrefix}'
var aoaiName = 'aoai-${namePrefix}'
var diName = 'di-${namePrefix}'
var appInsightsName = 'appi-${namePrefix}'
var logAnalyticsName = 'log-${namePrefix}'

// Built-in role definition IDs (constant across tenants).
var roleAcrPullId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var roleKeyVaultSecretsUserId = '4633458b-17de-408a-b874-0445c86b69e6'
var roleKeyVaultAdministratorId = '00482a5a-887f-4fb3-b363-3b7fe8e74483'
var roleStorageBlobDataContributorId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

// -----------------------------------------------------------------------------
// Container Registry
// -----------------------------------------------------------------------------

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

// -----------------------------------------------------------------------------
// Log Analytics workspace + Application Insights
// -----------------------------------------------------------------------------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// -----------------------------------------------------------------------------
// PostgreSQL Flexible Server
// -----------------------------------------------------------------------------

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: postgresName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminUser
    administratorLoginPassword: dbAdminPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgres
  name: postgresDatabaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Allow Azure-internal services (incl. App Service) through the firewall.
resource postgresFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// -----------------------------------------------------------------------------
// Storage account + containers
// -----------------------------------------------------------------------------

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 14
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 14
    }
  }
}

resource containerDocuments 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobServices
  name: 'documents'
  properties: {
    publicAccess: 'None'
  }
}

resource containerArchives 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobServices
  name: 'archives'
  properties: {
    publicAccess: 'None'
  }
}

resource containerBackups 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobServices
  name: 'backups'
  properties: {
    publicAccess: 'None'
  }
}

// -----------------------------------------------------------------------------
// Azure OpenAI account (region-locked to Australia East)
// -----------------------------------------------------------------------------
//
// NOTE: GPT-4o model *deployment* under this account is created post-bicep
// via `az cognitiveservices account deployment create` — see
// docs/deployment.md. This template only stands up the parent account.

resource aoai 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: aoaiName
  location: location
  sku: {
    name: 'S0'
  }
  kind: 'OpenAI'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: aoaiName
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

// -----------------------------------------------------------------------------
// Document Intelligence (Form Recognizer)
// -----------------------------------------------------------------------------

resource di 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: diName
  location: location
  sku: {
    name: 'S0'
  }
  kind: 'FormRecognizer'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: diName
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

// -----------------------------------------------------------------------------
// Key Vault (RBAC mode)
// -----------------------------------------------------------------------------

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 14
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// Grant the deploying user Key Vault Administrator on this vault — needed so
// the operator can populate secrets via `az keyvault secret set` after the
// bicep deployment lands.
resource kvAdminAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, deployerObjectId, roleKeyVaultAdministratorId)
  properties: {
    principalId: deployerObjectId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roleKeyVaultAdministratorId
    )
    principalType: 'User'
  }
}

// -----------------------------------------------------------------------------
// App Service Plan + Web App
// -----------------------------------------------------------------------------

resource asp 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: aspName
  location: location
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true // required for Linux plans
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  kind: 'app,linux,container'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: asp.id
    httpsOnly: true
    siteConfig: {
      alwaysOn: true
      linuxFxVersion: 'DOCKER|${acr.properties.loginServer}/umbra-prototype:latest'
      acrUseManagedIdentityCreds: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      healthCheckPath: '/api/health'
      appSettings: [
        // ---- Container registry ----
        {
          name: 'DOCKER_REGISTRY_SERVER_URL'
          value: 'https://${acr.properties.loginServer}'
        }
        // ---- Build / runtime ----
        {
          name: 'WEBSITES_PORT'
          value: '3000'
        }
        {
          name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE'
          value: 'false'
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        // ---- Application Insights ----
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        // ---- Endpoints (non-secret config) ----
        {
          name: 'AZURE_OPENAI_ENDPOINT'
          value: aoai.properties.endpoint
        }
        {
          name: 'AZURE_OPENAI_DEPLOYMENT'
          value: 'gpt-4o'
        }
        {
          name: 'AZURE_DI_ENDPOINT'
          value: di.properties.endpoint
        }
        {
          name: 'AZURE_STORAGE_CONTAINER'
          value: 'documents'
        }
        // ---- Secrets (Key Vault references) ----
        // Each secret is wired via `@Microsoft.KeyVault(SecretUri=...)`.
        // The vault's secret URI is stable; provision.sh writes the
        // initial values via `az keyvault secret set`.
        {
          name: 'DATABASE_URL'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=database-url)'
        }
        {
          name: 'AUTH_SECRET'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=auth-secret)'
        }
        {
          name: 'AZURE_OPENAI_KEY'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=azure-openai-key)'
        }
        {
          name: 'AZURE_DI_KEY'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=azure-di-key)'
        }
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=azure-storage-connection-string)'
        }
        {
          name: 'AZURE_AD_CLIENT_ID'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=azure-ad-client-id)'
        }
        {
          name: 'AZURE_AD_CLIENT_SECRET'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=azure-ad-client-secret)'
        }
        {
          name: 'AZURE_AD_TENANT_ID'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=azure-ad-tenant-id)'
        }
      ]
    }
  }
}

// -----------------------------------------------------------------------------
// RBAC role assignments — Web App managed identity
// -----------------------------------------------------------------------------

// Web App can pull from ACR.
resource webAppAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, webApp.id, roleAcrPullId)
  properties: {
    principalId: webApp.identity.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roleAcrPullId
    )
    principalType: 'ServicePrincipal'
  }
}

// Web App can read Key Vault secrets (resolves the @Microsoft.KeyVault refs).
resource webAppKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, webApp.id, roleKeyVaultSecretsUserId)
  properties: {
    principalId: webApp.identity.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roleKeyVaultSecretsUserId
    )
    principalType: 'ServicePrincipal'
  }
}

// Web App can write blobs (the storage abstraction's local fallback uses
// connection-string auth; this RBAC is for future managed-identity blob auth).
resource webAppStorageContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, webApp.id, roleStorageBlobDataContributorId)
  properties: {
    principalId: webApp.identity.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      roleStorageBlobDataContributorId
    )
    principalType: 'ServicePrincipal'
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

output webAppDefaultHostName string = webApp.properties.defaultHostName
output webAppName string = webApp.name
output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
output postgresFqdn string = postgres.properties.fullyQualifiedDomainName
output postgresAdminUser string = postgresAdminUser
output postgresDatabaseName string = postgresDatabaseName
output storageAccountName string = storage.name
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output aoaiEndpoint string = aoai.properties.endpoint
output aoaiName string = aoai.name
output diEndpoint string = di.properties.endpoint
output diName string = di.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
