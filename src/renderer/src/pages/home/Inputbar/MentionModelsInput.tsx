import HorizontalScrollContainer from '@renderer/components/HorizontalScrollContainer'
import CustomTag from '@renderer/components/Tags/CustomTag'
import { getModelUniqId } from '@renderer/services/ModelService'
import type { Model } from '@renderer/types'
import type { FC } from 'react'
import styled from 'styled-components'

const MentionModelsInput: FC<{
  selectedModels: Model[]
  onRemoveModel: (model: Model) => void
}> = ({ selectedModels, onRemoveModel }) => {
  return (
    <Container>
      <HorizontalScrollContainer dependencies={[selectedModels]} expandable>
        {selectedModels.map((model) => (
          <CustomTag
            icon={<i className="iconfont icon-at" />}
            color="#1677ff"
            key={getModelUniqId(model)}
            closable
            onClose={() => onRemoveModel(model)}>
            {model.name}
          </CustomTag>
        ))}
      </HorizontalScrollContainer>
    </Container>
  )
}

const Container = styled.div`
  width: 100%;
  padding: 5px 15px 5px 15px;
`

export default MentionModelsInput
