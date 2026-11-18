import { createRoot } from 'react-dom/client';
import { ReceiptCheckout } from './checkout';
import { demoMethods, demoOrder, demoSamples } from './demo-config';
import { createDemoVerifier, demoProvider, validateDemoEvidence } from './demo-verification';

const element = document.getElementById('checkout-root');
if (element) {
  createRoot(element).render(
    <ReceiptCheckout
      branding={{ name: 'Juniper Supply', caption: 'Sample merchant', mark: 'J' }}
      order={demoOrder}
      paymentMethods={demoMethods}
      onSubmitReceipt={createDemoVerifier()}
      evidence={{
        simulated: true,
        validate: validateDemoEvidence,
        sample: (id, kind) => {
          const provider = demoProvider(id);
          return provider ? demoSamples[provider][kind] : undefined;
        },
      }}
      sections={{
        orderFooter: <p>Receipt checks do not confirm settlement or authorize delivery.</p>,
      }}
    />,
  );
}
