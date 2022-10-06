import { Application } from '../../../declarations'
import config from '../../appconfig'
import { SubscriptionConfirm } from './subscription-confirm.class'
import subscriptionConfirmDocs from './subscription-confirm.docs'
import hooks from './subscription-confirm.hooks'

// Add this service to the service type index
declare module '@xrengine/common/declarations' {
  interface ServiceTypes {
    'subscription-confirm': SubscriptionConfirm
  }
}

export default (app: Application) => {
  const options = {
    paginate: app.get('paginate')
  }

  /**
   * Initialize our service with any options it requires and docs
   */
  const event = new SubscriptionConfirm(options, app)
  event.docs = subscriptionConfirmDocs

  app.use('subscription-confirm', event, (req, res) => {
    res.redirect(config.client.url)
  })

  /**
   * Get our initialized service so that we can register hooks
   */
  const service = app.service('subscription-confirm')

  service.hooks(hooks)
}
