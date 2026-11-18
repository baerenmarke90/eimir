import { useNavigate } from 'react-router-dom';
import { appRoutePath } from '../client/routes';
import { WhoOfUsGamePanel } from './WhoOfUsGamePanel';

/**
 * Who of us on its own address (#2048), so a "your turn" notice can open the
 * game directly. The Games shelf keeps opening it in place.
 */
export function WhoOfUsGamePage({
  apiBaseUrl,
  accessToken,
  spaceId,
  currentAccountId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  currentAccountId: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="page games-product-page">
      <WhoOfUsGamePanel
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
        spaceId={spaceId}
        currentAccountId={currentAccountId}
        onExit={() => void navigate(appRoutePath('games'))}
      />
    </div>
  );
}
