import { useParams, useNavigate } from "react-router-dom";
import { Button } from "../../shared/ui/Button";
import { Page } from "../../shared/ui/Page";

export function InfoPage() {
  const { slug } = useParams();
  const nav = useNavigate();

  return (
    <Page title={`Info: ${slug ?? ""}`}>
      <Button variant="secondary" onClick={() => nav(-1)}>Назад</Button>
    </Page>
  );
}

export default InfoPage;
